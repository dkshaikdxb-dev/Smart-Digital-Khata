interface EmptyStateProps {
  title: string;
  description: string;
}

export default function EmptyState({
  title,
  description
}: EmptyStateProps) {
  return (
    <div className="bg-white rounded-2xl shadow p-10 text-center">
      <h2 className="text-2xl font-semibold mb-3">
        {title}
      </h2>

      <p className="text-gray-500">
        {description}
      </p>
    </div>
  );
}
