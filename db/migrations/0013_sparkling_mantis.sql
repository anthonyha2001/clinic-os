ALTER TABLE "appointments" ADD CONSTRAINT "chk_duration_bounds" CHECK ("appointments"."end_time" > "appointments"."start_time"
          AND "appointments"."end_time" >= "appointments"."start_time" + interval '5 minutes'
          AND "appointments"."end_time" <= "appointments"."start_time" + interval '12 hours');