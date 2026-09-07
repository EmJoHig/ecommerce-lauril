CREATE TABLE "store_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "store_name" VARCHAR(120) NOT NULL,
    "public_email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(30),
    "whatsapp" VARCHAR(30),
    "business_address" VARCHAR(300),
    "instagram_url" VARCHAR(500),
    "facebook_url" VARCHAR(500),
    "public_description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_settings_single_row_check" CHECK ("id" = 1),
    CONSTRAINT "store_settings_store_name_check" CHECK (char_length(btrim("store_name")) BETWEEN 1 AND 120),
    CONSTRAINT "store_settings_public_email_check" CHECK (char_length(btrim("public_email")) BETWEEN 3 AND 320)
);

INSERT INTO "store_settings" (
    "id",
    "store_name",
    "public_email",
    "business_address",
    "public_description",
    "updated_at"
) VALUES (
    1,
    'Lauril',
    'hola@lauril.com.ar',
    'Buenos Aires, Argentina',
    'Objetos elegidos para acompañar tus rituales cotidianos.',
    CURRENT_TIMESTAMP
);
