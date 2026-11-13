-- A Mutação fica sempre ligada (dono, 13/11/2026): o site não a desliga quando esvazia.
UPDATE "servidores_diversao" SET "sob_demanda" = false WHERE "modo" = 'mutacao';
