-- The embedding registry moved from the intfloat e5 repos to their Xenova
-- mirrors (same architecture/dim/e5-prefix, but the mirrors ship the standard
-- quantized onnx variants). A persisted choice that still names an intfloat id
-- would no longer resolve against the new registry and crash embedding
-- resolution on boot. Rewrite the stored model ids in place; the dimension is
-- unchanged, so the pgvector columns and existing vectors stay valid.
UPDATE "system_settings"
SET "embedding_model" = replace("embedding_model", 'intfloat/', 'Xenova/')
WHERE "embedding_model" LIKE 'intfloat/%';
--> statement-breakpoint
UPDATE "embedding_runtime"
SET "model" = replace("model", 'intfloat/', 'Xenova/')
WHERE "model" LIKE 'intfloat/%';
