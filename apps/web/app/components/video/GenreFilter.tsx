"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { Genre } from "@mediaflow/shared-types";

interface GenreFilterProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
}

export function GenreFilter({
  searchValue,
  onSearchChange,
  selectedGenre,
  onGenreChange,
}: GenreFilterProps) {
  const [genres, setGenres] = useState<Genre[]>([]);

  useEffect(() => {
    apiFetch("/genres")
      .then((res) => res.json())
      .then((data) => setGenres(data.genres ?? []))
      .catch(() => setGenres([]));
  }, []);

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <input
        type="text"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Cari judul video..."
        className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onGenreChange("")}
          className={`px-3 py-1.5 rounded-full border text-sm ${
            selectedGenre === ""
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300"
          }`}
        >
          Semua
        </button>
        {genres.map((genre) => (
          <button
            key={genre.id}
            onClick={() => onGenreChange(genre.name)}
            className={`px-3 py-1.5 rounded-full border text-sm ${
              selectedGenre === genre.name
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300"
            }`}
          >
            {genre.name}
          </button>
        ))}
      </div>
    </div>
  );
}