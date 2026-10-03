# Eval des notions clés (M11) — 2026-10-03

Modèle : claude-sonnet-5 (défaut). Dépense cumulée de la mission après ce passage : 1.489 $ sur 10 $.

## Volume

| Cours | Car. | Pages | Notions de lecture | Avant (formule : min / typique / max) | Notions clés | Flashcards (borne) | QCM (borne) | Questions libres (borne) | Total |
|---|---|---|---|---|---|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | 36248 | 24.2 | 61 | 183 / 641 / 915 | 57 (33 ess., 15 synth.) | 57 (39–59) ✓ | 29 (19–29) ✓ | 12 (8–12) ✓ | 98 ✓ |

## Couverture et doublons

| Cours | Parties déclarées | Parties de référence non retrouvées | Doublons de titre | Titres proches (Jaccard ≥ 0,5) | Questions proches, même type (Jaccard ≥ 0,6) | Notions de lecture couvertes |
|---|---|---|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | 7 | aucune | 0 | 1 | 0 | 61 / 61 |

## QCM

| Cours | Position de la bonne réponse (1 / 2 / 3 / 4) | Longueurs d'options hors heuristique | Bonne réponse = option la plus longue (hasard : 25 %) |
|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | 5 / 12 / 4 / 8 | 0 | 11 / 29 |

## Coût et appels

| Cours | Phase | Appels | Tokens d'entrée | Tokens de sortie | Coût |
|---|---|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | découpage | 6 | 27601 | 28338 | 0.339 $ |
| A2A, chapitres 1–6 (~25 pages) | notions clés | 1 | 18727 | 6554 | 0.103 $ |
| A2A, chapitres 1–6 (~25 pages) | génération des cartes | 12 | 71398 | 15657 | 0.299 $ |

## Détail

### A2A, chapitres 1–6 (~25 pages)

Parties déclarées : « 1. Introduction : pourquoi A2A », « 2. Concepts fondamentaux », « 3. Architecture en couches et bindings », « 4. Cycle de vie des tâches, streaming et notifications push », « 4 bis. Résilience : crash serveur et coupure réseau », « 5. Découverte des agents et Agent Card », « 6. Sécurité : authentification, autorisation, confiance »

Titres proches : « Fonctionnement des notifications push » / « Fiabilité des notifications push » (0.5)

Questions proches : aucune

- Problème résolu par A2A — essentielle, synthèse — 1. Introduction : pourquoi A2A
- Exécution opaque — essentielle — 1. Introduction : pourquoi A2A
- Objectifs et principes de conception — importante — 1. Introduction : pourquoi A2A
- Historique et gouvernance d'A2A — importante — 1. Introduction : pourquoi A2A
- Nouveautés clés de la v1.0 — importante — 1. Introduction : pourquoi A2A
- Rôles client, serveur et utilisateur — essentielle — 2. Concepts fondamentaux
- Les six objets du modèle A2A — essentielle — 2. Concepts fondamentaux
- Agent Card comme carte d'identité — essentielle — 2. Concepts fondamentaux
- Structure d'une Part — essentielle — 2. Concepts fondamentaux
- Task et Artifact — essentielle — 2. Concepts fondamentaux
- Contexte comme regroupement logique — importante — 2. Concepts fondamentaux
- Règle d'or Message vs Artifact — essentielle, synthèse — 2. Concepts fondamentaux
- Choix entre Message direct et Task — essentielle, synthèse — 2. Concepts fondamentaux
- Identifiants et multi-tour — essentielle — 2. Concepts fondamentaux
- Règles de génération des identifiants — importante — 2. Concepts fondamentaux
- Architecture en trois couches — essentielle, synthèse — 3. Architecture en couches et bindings
- Les 11 opérations du protocole — essentielle — 3. Architecture en couches et bindings
- Correspondance des opérations entre bindings — importante — 3. Architecture en couches et bindings
- Comparatif des trois bindings — essentielle, synthèse — 3. Architecture en couches et bindings
- Versionnement du protocole — importante — 3. Architecture en couches et bindings
- Modèle d'erreurs unifié — importante — 3. Architecture en couches et bindings
- Machine à états d'une Task — essentielle — 4. Cycle de vie des tâches, streaming et notifications push
- États terminaux — essentielle — 4. Cycle de vie des tâches, streaming et notifications push
- Mode bloquant vs non bloquant — essentielle, synthèse — 4. Cycle de vie des tâches, streaming et notifications push
- Trois mécanismes de suivi d'une tâche — essentielle, synthèse — 4. Cycle de vie des tâches, streaming et notifications push
- Format du flux de streaming — essentielle — 4. Cycle de vie des tâches, streaming et notifications push
- Découpage des artifacts en streaming — importante — 4. Cycle de vie des tâches, streaming et notifications push
- Garanties du streaming — importante — 4. Cycle de vie des tâches, streaming et notifications push
- Reconnexion via SubscribeToTask — essentielle — 4. Cycle de vie des tâches, streaming et notifications push
- Fonctionnement des notifications push — essentielle — 4. Cycle de vie des tâches, streaming et notifications push
- Fiabilité des notifications push — importante — 4. Cycle de vie des tâches, streaming et notifications push
- Scénario multi-tour avec humain dans la boucle — importante — 4. Cycle de vie des tâches, streaming et notifications push
- Principe de résilience : l'état serveur comme seule vérité — essentielle, synthèse — 4 bis. Résilience : crash serveur et coupure réseau
- Bonnes pratiques de résilience serveur et client — importante — 4 bis. Résilience : crash serveur et coupure réseau
- Catalogue des incidents réseau — importante — 4 bis. Résilience : crash serveur et coupure réseau
- Remèdes côté client face aux coupures réseau — essentielle, synthèse — 4 bis. Résilience : crash serveur et coupure réseau
- Mécanisme de reprise après coupure réseau — essentielle — 4 bis. Résilience : crash serveur et coupure réseau
- Backoff exponentiel et disjoncteur — importante — 4 bis. Résilience : crash serveur et coupure réseau
- Conséquences d'un crash serveur sans architecture résiliente — essentielle, synthèse — 4 bis. Résilience : crash serveur et coupure réseau
- Séparation des responsabilités pour encaisser un crash — essentielle, synthèse — 4 bis. Résilience : crash serveur et coupure réseau
- Composants d'une architecture résiliente — importante — 4 bis. Résilience : crash serveur et coupure réseau
- Règle d'or de reprise après crash — essentielle — 4 bis. Résilience : crash serveur et coupure réseau
- Stratégies face à un crash ou webhook injoignable — importante — 4 bis. Résilience : crash serveur et coupure réseau
- Rôle et publication de l'Agent Card — essentielle — 5. Découverte des agents et Agent Card
- Champs obligatoires de l'Agent Card v1.0 — essentielle — 5. Découverte des agents et Agent Card
- Processus de vérification d'une carte par le client — importante — 5. Découverte des agents et Agent Card
- Trois méthodes de découverte — essentielle, synthèse — 5. Découverte des agents et Agent Card
- Carte publique vs carte étendue — importante — 5. Découverte des agents et Agent Card
- Signature des Agent Cards — importante — 5. Découverte des agents et Agent Card
- Mise en cache de l'Agent Card — importante — 5. Découverte des agents et Agent Card
- Principe de sécurité : délégation aux standards web — essentielle, synthèse — 6. Sécurité : authentification, autorisation, confiance
- Schémas d'authentification déclarables — essentielle — 6. Sécurité : authentification, autorisation, confiance
- Déroulement du flux d'authentification — importante — 6. Sécurité : authentification, autorisation, confiance
- État AUTH_REQUIRED et consentement juste à temps — essentielle, synthèse — 6. Sécurité : authentification, autorisation, confiance
- Obligations de sécurité côté serveur — importante — 6. Sécurité : authentification, autorisation, confiance
- Menaces spécifiques et contre-mesures — importante — 6. Sécurité : authentification, autorisation, confiance
- Limite sur la délégation d'identité de bout en bout — essentielle, synthèse — 6. Sécurité : authentification, autorisation, confiance
