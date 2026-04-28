# 2026-04-28 Vector Recall Strategy

- Split vector memory behavior into strict automatic injection and wider manual exploration.
- Automatic recall now gates candidates by similarity, lexical overlap, and explicit recall intent before injecting history into the model context.
- Manual `/recall query` and `memory_vector_search` can use a lower threshold and expose confidence / lexical overlap for verification.
- Whole-turn embedding now keeps more assistant context so recalled memories remain understandable.

