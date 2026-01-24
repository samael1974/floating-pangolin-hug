import { Link } from "react-router-dom";
import { ReliefWizard } from "@/components/relief/ReliefWizard";

export default function ReliefPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-center md:text-left">
            Generatore Bassorilievi
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload → Parametri → Heightmap → STL.
          </p>
        </div>

        <Link
          to="/"
          className="text-sm underline text-gray-700 hover:text-gray-900"
        >
          Torna alla Home
        </Link>
      </div>

      <div className="mt-8">
        <ReliefWizard />
      </div>
    </div>
  );
}
