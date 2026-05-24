# LitigARG API

## Base de datos

LitigARG usa PostgreSQL cuando existe la variable de entorno `DATABASE_URL`.
Si esa variable no existe, usa `database.json` como respaldo local.

En Render:

1. Crear una base de datos PostgreSQL.
2. Copiar la `Internal Database URL`.
3. Pegarla en el servicio web como variable `DATABASE_URL`.
4. Hacer deploy nuevamente.

La aplicación crea automáticamente las tablas:

- `users`: usuario, correo y contraseña cifrada.
- `subscriptions`: plan, estado y vencimiento.
- `payments`: pagos recibidos desde Mercado Pago.
- `free_usage`: uso gratuito disponible por usuario.

Si la base PostgreSQL está vacía y existe `database.json`, LitigARG copia esos datos iniciales una sola vez. Para evitar esa copia automática, usar `MIGRATE_JSON_DB=false`.
