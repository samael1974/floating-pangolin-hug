import React from "react";
import { Link } from "react-router-dom";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";

export default function Relief() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Generatore Bassorilievi (MVP)</h1>
          <Link
            to="/"
            className="text-sm underline underline-offset-4 hover:opacity-80"
          >
            Torna alla Home
          </Link>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div>Relief Wizard Placeholder</div>
        </div>
      </div>
    </div>
  );
}
