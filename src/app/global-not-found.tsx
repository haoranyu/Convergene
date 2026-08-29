import './globals.css';

import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Page not found · Convergene',
};

export default async function GlobalNotFound() {
  await connection();

  return (
    <html lang="en">
      <body>
        <main className="global-message">
          <h1>Page not found</h1>
          <p>页面不存在 · 頁面不存在</p>
          <Link href="/">Return home · 返回首页 · 返回首頁</Link>
        </main>
      </body>
    </html>
  );
}
