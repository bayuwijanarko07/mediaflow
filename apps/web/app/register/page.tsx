import { RegisterForm } from "@/app/components/auth/RegisterForm";

export const metadata = {
  title: "Daftar | Mediaflow",
};

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <RegisterForm />
    </main>
  );
}