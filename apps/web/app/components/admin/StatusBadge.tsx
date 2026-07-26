const STATUS_STYLES: Record<string, string> = {
  UPLOADING: "bg-gray-100 text-gray-700",
  UPLOADED: "bg-gray-100 text-gray-700",
  QUEUED: "bg-yellow-100 text-yellow-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  READY: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}