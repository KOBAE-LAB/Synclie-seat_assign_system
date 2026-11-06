import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/ResetForm";

export const metadata: Metadata = {
  title: "パスワードを再設定",
};

export default function TeacherResetPage() {
  return (
    <main className="page">
      <ResetForm />
    </main>
  );
}
