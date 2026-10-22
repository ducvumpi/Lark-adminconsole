SELECT rec_id AS id, ("Loại").name AS type, ("Trạng thái").name AS status, CURRENT_USER_ID() AS operator_id
FROM "DMS - Đối tác"
WHERE rec_id = $1
LIMIT 1
