"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/lib/action";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await loginAction(formData);
    if (!result.success) {
      setError(result.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          Lark Base Manager
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 24 }}>
          Đăng nhập để tiếp tục
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form action={(fd) => startTransition(() => handleSubmit(fd))}>
          <div className="field-group">
            <label htmlFor="password">Mật khẩu</label>
            <input type="password" id="password" name="password" autoFocus required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={isPending}>
            {isPending ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}