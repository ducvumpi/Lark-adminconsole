This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Embedding in a workspace iframe

Set `FRAME_ANCESTORS` to a space-separated list of allowed ancestor origins, including scheme and optional port, for example:

```env
FRAME_ANCESTORS=https://workspace.example.com https://admin.example.com
```

The response uses this value in `Content-Security-Policy: frame-ancestors`. If it is unset, only same-origin framing is allowed (`'self'`). The session cookie is issued as `SameSite=None; Secure` for cross-site iframe requests, so the console must be served over HTTPS. Browsers or workspace policies may still block third-party cookies.

## Danh mục mã ngân sách

Mở mục **Mã ngân sách** trên thanh bên để tra cứu 146 mã, lọc theo nhóm và tải toàn bộ danh mục JSON kèm cấp và mã cha.

Danh sách gốc được lưu tại `data/budget-codes.json`; `app/lib/budget-codes.ts` cung cấp dữ liệu dùng chung và suy ra quan hệ cha/con từ hậu tố hai hoặc bốn chữ số. Khi cập nhật danh mục, sửa tệp JSON và build/deploy lại ứng dụng. Các mã `ADS007- 01` đến `ADS007- 05` đã được bỏ khoảng trắng thừa; hai tiền tố `GOI` và `GOO` giữ nguyên theo danh sách cung cấp.

Mỗi file Excel có checkbox **File có mã ngân sách con**, mặc định được tích để giữ logic import hiện tại. Bỏ tích khi file chỉ xin mã cấp 1: mã có con trong danh mục được thêm `-00-00` (ví dụ `BOO002-00-00`), mã không có con giữ nguyên (ví dụ `BOO001`); các dòng mã con không được import ở chế độ này. Áp dụng cho cả layout tháng theo cột và Brand theo cột.

## Chạy ứng dụng

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
