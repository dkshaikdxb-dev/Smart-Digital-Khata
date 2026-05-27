interface StatsCardProps {
  title: string;
  value: string;
}

export default function StatsCard({
  title,
  value
}: StatsCardProps) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow">
      <h2 className="text-sm text-gray-500 mb-2">
        {title}
      </h2>

      <p className="text-3xl font-bold">
        {value}
      </p>
    </div>
  );
}
