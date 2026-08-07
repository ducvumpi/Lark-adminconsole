function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFieldTerm(fieldTerm) {
  return fieldTerm
    .replace(/^.*?(?:record|bản ghi|bai ghi|có|voi|với|mà)\s+/i, '')
    .replace(/^tìm(?:.*?\s)?/i, '')
    .trim();
}

function parseVietnameseQuery(query) {
  const cleanedQuery = query.replace(/[“”]/g, '"').trim();
  const normalized = normalizeText(cleanedQuery);
  const matcher = normalized.match(
    /^(?:.*?(?:co|voi|ma)\s+)?(.+?)\s+(lon hon hoac bang|khong nho hon|>=|≥|lon hon|>|nho hon hoac bang|khong lon hon|<=|≤|nho hon|<|bang|=|la|chua|khong chua|truoc|sau|khac voi)\s+(.+)$/i
  );
  return { normalized, matcher };
}

const query = 'Tìm tất cả record có tên ngân sách là Ngân sách Bán hàng Q3';
const result = parseVietnameseQuery(query);
console.log(result);
if (result.matcher) {
  const rawField = cleanFieldTerm(result.matcher[1]).trim();
  const operator = result.matcher[2];
  const rawValue = result.matcher[3].trim();
  console.log('rawField=', rawField);
  console.log('operator=', operator);
  console.log('rawValue=', rawValue);
}
