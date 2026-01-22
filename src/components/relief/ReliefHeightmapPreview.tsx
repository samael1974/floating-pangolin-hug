"use client";

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

const ReliefHeightmapPreview = ({ imageUrl }: { imageUrl: string }) => {
  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardContent>
        <Image
          src={imageUrl}
          alt="Relief Heightmap Preview"
          width={300}
          height={200}
          className="rounded-lg shadow-md"
        />
      </CardContent>
    </Card>
  );
};

export default ReliefHeightmapPreview;