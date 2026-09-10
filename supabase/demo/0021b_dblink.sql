-- clariq-demo only: dblink lets the demo project pull the Ask Clariq corpus
-- (documents + embedded chunks) straight from production, server to server,
-- instead of re-ingesting and re-embedding. See copy_corpus_to_demo.sql.
create extension if not exists dblink with schema extensions;
