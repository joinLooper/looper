-- SQLite compatibility helpers for the approved v27 TEXT contract.
CREATE FUNCTION sqlite_json_valid(doc text) RETURNS bigint LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN IF doc IS NULL THEN RETURN NULL; END IF; PERFORM doc::json; RETURN 1;
EXCEPTION WHEN invalid_text_representation THEN RETURN 0; END $$;
CREATE FUNCTION sqlite_json_compact(doc text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result text := ''; ch text; quoted boolean := false; escaped boolean := false; i integer;
BEGIN
  FOR i IN 1..length(doc) LOOP
    ch := substr(doc,i,1);
    IF quoted THEN
      result := result || ch;
      IF escaped THEN escaped := false; ELSIF ch = chr(92) THEN escaped := true; ELSIF ch = '"' THEN quoted := false; END IF;
    ELSIF ch = '"' THEN quoted := true; result := result || ch;
    ELSIF ch NOT IN (' ',chr(9),chr(10),chr(13)) THEN result := result || ch;
    END IF;
  END LOOP;
  RETURN result;
END $$;
CREATE FUNCTION sqlite_json_extract(doc text, path text) RETURNS json LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE value json; kind text; parsed json := doc::json;
BEGIN
  IF path !~ '^\$\.[A-Za-z_][A-Za-z0-9_]*$' THEN RAISE EXCEPTION 'Unsupported SQLite JSON path: %',path; END IF;
  IF json_typeof(parsed) <> 'object' THEN RETURN NULL; END IF;
  SELECT item.value INTO value FROM json_each(parsed) AS item WHERE item.key = substr(path,3) LIMIT 1;
  IF value IS NULL OR json_typeof(value) = 'null' THEN RETURN NULL; END IF;
  kind := json_typeof(value);
  IF kind = 'boolean' THEN RETURN CASE WHEN value::text = 'true' THEN '1'::json ELSE '0'::json END; END IF;
  IF kind IN ('array','object') THEN RETURN to_json(sqlite_json_compact(value::text)); END IF;
  RETURN value;
END $$;
CREATE FUNCTION sqlite_typeof(value json) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value IS NULL THEN RETURN 'null'; END IF;
  IF json_typeof(value) = 'string' THEN RETURN 'text'; END IF;
  IF value::text ~ '^-?[0-9]+$' THEN RETURN 'integer'; END IF;
  RETURN 'real';
END $$;
CREATE FUNCTION sqlite_json_compare_number(doc text,path text,op text,rhs numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE value json := sqlite_json_extract(doc,path); number numeric;
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  IF json_typeof(value) = 'string' THEN RETURN op IN ('>','>=','<>','!='); END IF;
  number := value::text::numeric;
  CASE op WHEN '>' THEN RETURN number > rhs; WHEN '>=' THEN RETURN number >= rhs; WHEN '=' THEN RETURN number = rhs; WHEN '<' THEN RETURN number < rhs; WHEN '<=' THEN RETURN number <= rhs; WHEN '<>' THEN RETURN number <> rhs; ELSE RAISE EXCEPTION 'Unsupported comparison'; END CASE;
END $$;
CREATE FUNCTION sqlite_json_set_raw(doc text,path text,replacement json) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE item record; result text := '{'; found boolean := false; first boolean := true;
BEGIN
  IF path !~ '^\$\.[A-Za-z_][A-Za-z0-9_]*$' THEN RAISE EXCEPTION 'Unsupported SQLite JSON path'; END IF;
  IF json_typeof(doc::json) <> 'object' THEN RETURN sqlite_json_compact(doc); END IF;
  FOR item IN SELECT * FROM json_each(doc::json) LOOP
    IF NOT first THEN result := result || ','; END IF; first := false;
    result := result || to_json(item.key)::text || ':';
    IF NOT found AND item.key = substr(path,3) THEN result := result || replacement::text; found := true;
    ELSE result := result || item.value::text; END IF;
  END LOOP;
  IF NOT found THEN
    IF NOT first THEN result := result || ','; END IF;
    result := result || to_json(substr(path,3))::text || ':' || replacement::text;
  END IF;
  RETURN sqlite_json_compact(result || '}');
END $$;
CREATE FUNCTION sqlite_json_set(doc text,path text,replacement bigint) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT sqlite_json_set_raw(doc,path,COALESCE(to_json(replacement),'null'::json)) $$;
CREATE FUNCTION sqlite_json_set(doc text,path text,replacement text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT sqlite_json_set_raw(doc,path,COALESCE(to_json(replacement),'null'::json)) $$;
CREATE FUNCTION sqlite_lower(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT translate(value,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') $$;
CREATE FUNCTION sqlite_glob(value text,pattern text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result text := '^'; ch text; i integer;
BEGIN
  FOR i IN 1..length(pattern) LOOP
    ch:=substr(pattern,i,1);
    IF ch='*' THEN result:=result||'.*'; ELSIF ch='?' THEN result:=result||'.';
    ELSIF ch IN ('.','+','(',')','{','}','$','|',chr(92)) THEN result:=result||chr(92)||ch;
    ELSE result:=result||ch; END IF;
  END LOOP;
  RETURN value ~ (result||'$');
END $$;
CREATE FUNCTION next_queue_order() RETURNS bigint LANGUAGE plpgsql VOLATILE AS $$
DECLARE result bigint;
BEGIN
  UPDATE w1b_control.queue_counters SET high_water=high_water+1 WHERE schema_name=current_schema() RETURNING high_water INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Missing isolated queue allocator'; END IF;
  RETURN result;
END $$;
