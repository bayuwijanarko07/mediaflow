import { LoginForm } from "@/app/components/auth/LoginForm";
import { Suspense } from "react";

export const metadata = {
  title: "Masuk | Mediaflow",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-6" />
      <div className="h-10 bg-gray-200 rounded mb-4" />
      <div className="h-10 bg-gray-200 rounded mb-4" />
      <div className="h-10 bg-gray-200 rounded" />
    </div>
  );
}