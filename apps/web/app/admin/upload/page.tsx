import { ProtectedRoute } from "@/app/components/auth/ProtectedRoute";
import { UploadForm } from "@/app/components/video/UploadForm";

export const metadata = { title: "Upload Video | Mediaflow Admin" };

export default function AdminUploadPage() {
  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-gray-50 py-12">
        <UploadForm />
      </main>
    </ProtectedRoute>
  );
}