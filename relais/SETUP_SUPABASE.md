# Persistance Supabase (2 minutes, sans terminal)

Par défaut le serveur RELAIS garde tout **en mémoire** : au redémarrage (Render
endort le service gratuit après inactivité), saisons et classements repartent à
zéro. Pour qu'ils **survivent**, branche Supabase — tout se fait au navigateur.

## 1. Crée un projet Supabase
- Va sur **supabase.com** → New project (le plan gratuit suffit).

## 2. Crée la table
Dans le projet : **SQL Editor** → colle ceci → Run :

```sql
create table if not exists relais_state (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
```

## 3. Récupère tes clés
Dans **Project Settings ▸ API** :
- **Project URL** (ex. `https://abcd.supabase.co`)
- **service_role key** (la clé secrète — usage **serveur uniquement**, jamais dans une app cliente)

## 4. Donne-les au serveur
Sur **Render** → ton service `relais-server` → **Environment** → ajoute :

| Clé | Valeur |
|-----|--------|
| `SUPABASE_URL` | ton Project URL |
| `SUPABASE_KEY` | ta service_role key |

Redéploie. Au démarrage les logs affichent :
```
[persist] ✅ état restauré (saison 3, 22 villes, record chaîne 128)
[persist] Supabase activé (sauvegarde toutes les 20s)
```

## Comment ça marche
- Le serveur charge l'instantané au boot, puis **sauvegarde toutes les 20 s**
  (réglable via `SAVE_SEC`) et à chaque **fin de saison**.
- Une seule ligne JSON (`id = 1`) contient : saison en cours, panthéon des
  gagnants, record de chaîne, et toutes les villes avec score + ligue.
- Sans les variables, le serveur tourne exactement comme avant (en mémoire).

> La `service_role key` contourne la sécurité niveau ligne (RLS) : elle ne doit
> vivre que côté serveur (variables Render), jamais dans `index.html`/l'app.
