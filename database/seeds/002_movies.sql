BEGIN;

INSERT INTO movies (
    title,
    description,
    duration_minutes,
    age_rating
)
SELECT
    new_movie.title,
    new_movie.description,
    new_movie.duration_minutes,
    NULL
FROM (
    VALUES
        (
            'Harry Potter and the Deathly Hallows: Part 1',
            'Harry, Ron and Hermione set out to destroy the Horcruxes and defeat Lord Voldemort.',
            146
        ),
        (
            'Bungo Stray Dogs: DEAD APPLE',
            'A mysterious fog causes gifted ability users to turn their powers against themselves.',
            90
        ),
        (
            'The Hunger Games',
            'Katniss Everdeen volunteers to take her sister’s place in a televised fight to the death.',
            142
        ),
        (
            'Avatar: The Way of Water',
            'Jake Sully and Neytiri must protect their family and explore the oceans of Pandora.',
            192
        ),
        (
            'Jujutsu Kaisen 0',
            'Yuta Okkotsu enters a school for jujutsu sorcerers while struggling with a dangerous curse.',
            105
        ),
        (
            'Beauty and the Beast',
            'A young woman discovers that a mysterious prince trapped in a beast’s body has a kind heart.',
            84
        ),
        (
            'The Twilight Saga: New Moon',
            'Bella Swan struggles with heartbreak and discovers the secrets of the werewolf world.',
            130
        ),
        (
            'Legally Blonde',
            'Elle Woods follows her former boyfriend to Harvard Law School and proves her abilities.',
            96
        ),
        (
            'The Lion King',
            'Young Simba must find his place in the Circle of Life and reclaim his kingdom.',
            88
        )
) AS new_movie(title, description, duration_minutes)
WHERE NOT EXISTS (
    SELECT 1
    FROM movies existing
    WHERE existing.title = new_movie.title
);

COMMIT;
