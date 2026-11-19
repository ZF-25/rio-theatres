
-- Rio Theatres
-- Migration: 009_add_movie_genres.sql
-- Purpose: Add genres and movie-to-genre relationships.

BEGIN;

CREATE TABLE genres (
    genre_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tmdb_genre_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL
);

CREATE INDEX idx_genres_name ON genres(name);

CREATE TABLE movie_genres (
    movie_id INTEGER NOT NULL
        REFERENCES movies(movie_id) ON DELETE CASCADE,

    genre_id INTEGER NOT NULL
        REFERENCES genres(genre_id) ON DELETE CASCADE,

    PRIMARY KEY (movie_id, genre_id)
);

CREATE INDEX idx_movie_genres_genre_id
    ON movie_genres(genre_id);

COMMIT;
