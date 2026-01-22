"use client";

import React from 'react';
import Link from 'next/link';

const Relief = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <h1 className="text-4xl font-bold mb-8">Generatore Bassorilievi (MVP)</h1>
      <Link href="/" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
        Go Back to Home
      </Link>
    </div>
  );
};

export default Relief;