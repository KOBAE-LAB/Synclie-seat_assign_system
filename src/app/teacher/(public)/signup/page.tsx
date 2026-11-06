import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "講師アカウントを作成",
};

export default function TeacherSignupPage() {
  return (
    <main className="page">
      <SignupForm />
    </main>
  );
}
