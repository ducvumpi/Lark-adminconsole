SELECT rec_id AS id, "Mã lượt ghé" AS code, "Đại lý ID" AS partner_id, "Thời gian check-in" AS visited_at, "Vĩ độ" AS latitude, "Kinh độ" AS longitude, "Độ chính xác (m)" AS accuracy, "Ghi chú" AS notes
FROM "DMS - Lượt ghé đại lý"
ORDER BY "Thời gian check-in" DESC, rec_id DESC
LIMIT 200 OFFSET $1
