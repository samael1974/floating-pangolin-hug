"use client";

import React from 'react';
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <h1 className="text-4xl font-bold mb-8">Welcome to My App</h1>
      <Link href="/relief" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
        Go to Bas-Relief Generator
      </Link>
    </div>
  );
};

export default Index;