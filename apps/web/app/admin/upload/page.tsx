import { RequireAdmin } from "@/app/components/auth/RequireAdmin";
import { UploadForm } from "@/app/components/video/UploadForm";

export const metadata = { title: "Upload Video | Mediaflow Admin" };

export default function AdminUploadPage() {
  return (
    <RequireAdmin>
      <main className="min-h-screen bg-gray-50 py-12">
        <UploadForm />
      </main>
    </RequireAdmin>
  );
}