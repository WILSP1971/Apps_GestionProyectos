-- =====================================================================
-- SierraFlow · 006 · Funciones y triggers
-- =====================================================================
SET search_path TO gestion, public;

-- 1) Metadatos de cambio: actualizado_en, version (concurrencia optimista) y seq_cambio (sync)
CREATE OR REPLACE FUNCTION gestion.fn_metadatos_cambio()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.version        := OLD.version + 1;
  NEW.seq_cambio     := nextval('gestion.seq_sync');
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['departamentos','usuarios','grupos_trabajo','proyectos','solicitudes',
                           'criterios_aceptacion','asignaciones','tareas','comentarios','riesgos']
  LOOP
    EXECUTE format('CREATE TRIGGER tg_%1$s_metadatos BEFORE UPDATE ON gestion.%1$I
                    FOR EACH ROW EXECUTE FUNCTION gestion.fn_metadatos_cambio()', t);
  END LOOP;
END $$;

-- 2) Validación de transiciones de estado + sellos de tiempo del ciclo de vida
CREATE OR REPLACE FUNCTION gestion.fn_validar_transicion_solicitud()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT EXISTS (SELECT 1 FROM gestion.transiciones_estado
                    WHERE desde = OLD.estado AND hacia = NEW.estado) THEN
      RAISE EXCEPTION 'Transición no permitida: % → %', OLD.estado, NEW.estado
        USING ERRCODE = 'check_violation';
    END IF;
    CASE NEW.estado
      WHEN 'ENVIADA'       THEN NEW.fecha_envio := coalesce(NEW.fecha_envio, now());
      WHEN 'APROBADA'      THEN NEW.fecha_aprobacion := now();
      WHEN 'EN_DESARROLLO' THEN NEW.fecha_inicio_desarrollo := coalesce(NEW.fecha_inicio_desarrollo, now());
      WHEN 'CERRADA'       THEN NEW.fecha_cierre := now(); NEW.avance_pct := 100;
      WHEN 'RECHAZADA'     THEN NEW.motivo_rechazo := coalesce(NEW.motivo_rechazo,
                                  nullif(current_setting('app.comentario_estado', true), ''));
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_solicitudes_transicion
  BEFORE UPDATE OF estado ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_validar_transicion_solicitud();

-- Si se inserta directamente como ENVIADA (crear y enviar en un paso)
CREATE OR REPLACE FUNCTION gestion.fn_solicitud_insert_enviada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'ENVIADA' THEN NEW.fecha_envio := coalesce(NEW.fecha_envio, now()); END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_solicitudes_insert_enviada
  BEFORE INSERT ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_solicitud_insert_enviada();

-- 3) Historial de estados (trazabilidad / línea de vida)
CREATE OR REPLACE FUNCTION gestion.fn_historial_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_usuario    uuid := nullif(current_setting('app.usuario_id', true), '')::uuid;
  v_comentario text := nullif(current_setting('app.comentario_estado', true), '');
  v_ultimo     timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO gestion.historial_estados(solicitud_id, estado_anterior, estado_nuevo, usuario_id)
    VALUES (NEW.id, NULL, NEW.estado, coalesce(v_usuario, NEW.solicitante_id));
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    SELECT max(fecha) INTO v_ultimo FROM gestion.historial_estados WHERE solicitud_id = NEW.id;
    INSERT INTO gestion.historial_estados(solicitud_id, estado_anterior, estado_nuevo, usuario_id,
                                          comentario, duracion_estado_anterior)
    VALUES (NEW.id, OLD.estado, NEW.estado, v_usuario, v_comentario, now() - v_ultimo);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER tg_solicitudes_historial
  AFTER INSERT OR UPDATE OF estado ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_historial_estado();

-- 4) Avance ponderado de la solicitud a partir de sus tareas
CREATE OR REPLACE FUNCTION gestion.fn_recalcular_avance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.solicitud_id ELSE NEW.solicitud_id END;
BEGIN
  UPDATE gestion.solicitudes s
     SET avance_pct = coalesce((
           SELECT round(sum(t.avance_pct * t.peso) / nullif(sum(t.peso), 0), 2)
             FROM gestion.tareas t
            WHERE t.solicitud_id = v_id AND NOT t.eliminado), 0)
   WHERE s.id = v_id AND s.estado <> 'CERRADA';
  RETURN NULL;
END $$;

CREATE TRIGGER tg_tareas_avance
  AFTER INSERT OR UPDATE OF avance_pct, peso, eliminado OR DELETE ON tareas
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_recalcular_avance();

-- 5) Aviso inmediato al despachador de eventos (LISTEN eventos_dominio)
CREATE OR REPLACE FUNCTION gestion.fn_notificar_outbox()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('eventos_dominio', NEW.id::text);
  RETURN NULL;
END $$;

CREATE TRIGGER tg_outbox_notify
  AFTER INSERT ON eventos_outbox
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_notificar_outbox();

-- 6) Aviso en tiempo real de nuevas notificaciones (SSE)
CREATE OR REPLACE FUNCTION gestion.fn_notificar_notificacion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('notificaciones_usuario',
    json_build_object('usuarioId', NEW.usuario_id, 'id', NEW.id)::text);
  RETURN NULL;
END $$;

CREATE TRIGGER tg_notificaciones_notify
  AFTER INSERT ON notificaciones
  FOR EACH ROW EXECUTE FUNCTION gestion.fn_notificar_notificacion();

-- 7) Auditoría genérica
CREATE OR REPLACE FUNCTION gestion.fn_auditoria()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid := nullif(current_setting('app.usuario_id', true), '')::uuid;
  v_antes   jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'busqueda' END;
  v_despues jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'busqueda' END;
BEGIN
  INSERT INTO gestion.auditoria(tabla, registro_id, operacion, usuario_id, datos_antes, datos_despues)
  VALUES (TG_TABLE_NAME,
          coalesce(v_despues->>'id', v_antes->>'id')::uuid,
          TG_OP::gestion.operacion_auditoria, v_usuario, v_antes, v_despues);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['solicitudes','asignaciones','tareas','evaluaciones','proyectos','riesgos']
  LOOP
    EXECUTE format('CREATE TRIGGER tg_%1$s_auditoria AFTER INSERT OR UPDATE OR DELETE ON gestion.%1$I
                    FOR EACH ROW EXECUTE FUNCTION gestion.fn_auditoria()', t);
  END LOOP;
END $$;

-- 8) Búsqueda de solicitudes similares (anti-duplicados del asistente de creación)
CREATE OR REPLACE FUNCTION gestion.fn_solicitudes_similares(p_texto text, p_limite int DEFAULT 5)
RETURNS TABLE(id uuid, codigo varchar, titulo varchar, estado gestion.estado_solicitud, similitud real)
LANGUAGE sql STABLE AS $$
  SELECT s.id, s.codigo, s.titulo, s.estado, similarity(s.titulo, p_texto) AS similitud
    FROM gestion.solicitudes s
   WHERE NOT s.eliminado
     AND s.estado NOT IN ('CANCELADA','RECHAZADA')
     AND similarity(s.titulo, p_texto) >= 0.3
   ORDER BY similitud DESC
   LIMIT p_limite;
$$;

-- 9) Conversión de nota 0–10 a letra
CREATE OR REPLACE FUNCTION gestion.fn_letra_calificacion(p_nota numeric)
RETURNS varchar LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_nota >= 9.5 THEN 'A+' WHEN p_nota >= 9.0 THEN 'A'
    WHEN p_nota >= 8.0 THEN 'B+' WHEN p_nota >= 7.0 THEN 'B'
    WHEN p_nota >= 6.0 THEN 'C'  ELSE 'D' END;
$$;
