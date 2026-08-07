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
    /^(?:.*?(?:có|với|mà)\s+)?(.+?)\s+(lớn hơn hoặc bằng|không nhỏ hơn|>=|≥|lớn hơn|>|nhỏ hơn hoặc bằng|không lớn hơn|<=|≤|nhỏ hơn|<|bằng|=|là|chứa|không chứa|trước|sau|khác với)\s+(.+)$/i
  );
  return { normalized, matcher };
}

function inferFieldCandidates(fieldNames, fieldTerm) {
  const normalizedTerm = normalizeText(fieldTerm);
  const fieldTokens = normalizedTerm.split(/\s+/).filter(Boolean);
  const standardFieldTerm = normalizedTerm
    .replace(/^(tên\s+)?(ngân\s+sách|ngân sách|tên ngân sách)$/i, 'tên ngân sách')
    .trim();

  const directMatches = fieldNames.filter((name) => {
    const normalizedName = normalizeText(name);
    return (
      normalizedName === normalizedTerm ||
      normalizedName.includes(normalizedTerm) ||
      normalizedTerm.includes(normalizedName) ||
      normalizedName === standardFieldTerm ||
      normalizedName.includes(standardFieldTerm)
    );
  });

  const tokenMatches = fieldNames.filter((name) => {
    const normalizedName = normalizeText(name);
    return fieldTokens.every((token) => normalizedName.includes(token));
  });

  return { normalizedTerm, standardFieldTerm, directMatches, tokenMatches };
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
  const fields = ['Tên ngân sách','Phòng ban','Kỳ (tháng/quý/năm)','Từ ngày','Đến ngày','Tổng ngân sách','Còn lại','Đã chi (lookup)','% sử dụng','Người tạo'];
  console.log(inferFieldCandidates(fields, rawField));
} else {
  console.log('No match');
}
