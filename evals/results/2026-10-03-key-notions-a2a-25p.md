# Eval des notions clés (M11) — 2026-10-03

Modèle : claude-sonnet-5 (défaut). Dépense cumulée de la mission après ce passage : 7.207 $ sur 10 $.

## Volume

| Cours | Car. | Pages | Notions de lecture | Avant (formule : min / typique / max) | Notions clés | Flashcards (borne) | QCM (borne) | Questions libres (borne) | Total |
|---|---|---|---|---|---|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | 36248 | 24.2 | 64 | 192 / 672 / 960 | 56 (33 ess., 16 synth.) | 56 (39–59) ✓ | 29 (19–29) ✓ | 12 (8–12) ✓ | 97 ✓ |

## Couverture et doublons

| Cours | Parties déclarées | Parties de référence non retrouvées | Doublons de titre | Titres proches (Jaccard ≥ 0,5) | Questions proches, même type (Jaccard ≥ 0,6) | Notions de lecture couvertes |
|---|---|---|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | 7 | aucune | 0 | 1 | 0 | 64 / 64 |

## QCM

| Cours | Position de la bonne réponse (1 / 2 / 3 / 4) | Longueurs d'options hors heuristique | Bonne réponse = option la plus longue (hasard : 25 %) |
|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | 8 / 12 / 3 / 6 | 0 | 9 / 29 |

## Coût et appels

| Cours | Phase | Appels | Tokens d'entrée | Tokens de sortie | Coût |
|---|---|---|---|---|---|
| A2A, chapitres 1–6 (~25 pages) | découpage | 6 | 33672 | 28864 | 0.356 $ |
| A2A, chapitres 1–6 (~25 pages) | notions clés | 1 | 18860 | 5878 | 0.097 $ |
| A2A, chapitres 1–6 (~25 pages) | génération des cartes | 11 | 59876 | 12433 | 0.244 $ |

## Détail

### A2A, chapitres 1–6 (~25 pages)

Parties déclarées : « Introduction : pourquoi A2A », « Concepts fondamentaux », « Architecture en couches et bindings », « Cycle de vie des tâches, streaming et notifications push », « Résilience : crash serveur et coupure réseau », « Découverte des agents et Agent Card », « Sécurité : authentification, autorisation, confiance »

Titres proches : « Machine à états d'une Task » / « États terminaux d'une Task » (0.5)

Questions proches : aucune

- Problème du coût N×N résolu par A2A — essentielle — Introduction : pourquoi A2A
- Exécution opaque, principe fondateur — essentielle — Introduction : pourquoi A2A
- Objectifs et principes de conception — importante — Introduction : pourquoi A2A
- Historique et gouvernance — importante — Introduction : pourquoi A2A
- Apports de la spécification v1.0 — importante — Introduction : pourquoi A2A
- Les trois acteurs d'A2A — essentielle — Concepts fondamentaux
- Agent Card, carte d'identité publique — essentielle — Concepts fondamentaux
- Message et Part, unités de communication — essentielle — Concepts fondamentaux
- Task, unité de travail avec cycle de vie — essentielle — Concepts fondamentaux
- Artifact et contexte — essentielle — Concepts fondamentaux
- Règle d'or : Message pour communiquer, Artifact pour livrer — essentielle, synthèse — Concepts fondamentaux
- Choix entre Message direct et Task — essentielle, synthèse — Concepts fondamentaux
- Identifiants et poursuite multi-tour — essentielle, synthèse — Concepts fondamentaux
- Architecture en trois couches d'A2A — essentielle, synthèse — Architecture en couches et bindings
- Les 11 opérations du protocole — essentielle — Architecture en couches et bindings
- Correspondance des opérations entre bindings — importante — Architecture en couches et bindings
- Choisir son binding de transport — importante, synthèse — Architecture en couches et bindings
- Versionnement du protocole — importante — Architecture en couches et bindings
- En-tête A2A-Extensions — importante — Architecture en couches et bindings
- Modèle d'erreurs unifié — importante — Architecture en couches et bindings
- Machine à états d'une Task — essentielle — Cycle de vie des tâches, streaming et notifications push
- États terminaux d'une Task — importante — Cycle de vie des tâches, streaming et notifications push
- Mode bloquant vs returnImmediately — essentielle, synthèse — Cycle de vie des tâches, streaming et notifications push
- Les trois mécanismes de suivi d'une Task — essentielle, synthèse — Cycle de vie des tâches, streaming et notifications push
- Structure d'un flux de streaming — essentielle — Cycle de vie des tâches, streaming et notifications push
- Découpage des artifacts en streaming — importante — Cycle de vie des tâches, streaming et notifications push
- Garanties d'ordre et de partage du flux — importante — Cycle de vie des tâches, streaming et notifications push
- Reconnexion via SubscribeToTask — essentielle — Cycle de vie des tâches, streaming et notifications push
- Fonctionnement des notifications push — essentielle — Cycle de vie des tâches, streaming et notifications push
- Principe de résilience : l'état serveur comme source de vérité — essentielle, synthèse — Résilience : crash serveur et coupure réseau
- Responsabilités de résilience serveur et client — importante — Résilience : crash serveur et coupure réseau
- Catalogue des incidents possibles — importante — Résilience : crash serveur et coupure réseau
- Bonnes pratiques client face aux coupures réseau — essentielle, synthèse — Résilience : crash serveur et coupure réseau
- Stratégie de reprise : rebrancher avant relancer — essentielle, synthèse — Résilience : crash serveur et coupure réseau
- ListTasks pour retrouver une tâche perdue — importante — Résilience : crash serveur et coupure réseau
- Backoff exponentiel et disjoncteur — importante — Résilience : crash serveur et coupure réseau
- Préférer le mode non bloquant pour les tâches longues — importante — Résilience : crash serveur et coupure réseau
- Architecture résiliente : séparer réception, exécution, diffusion — essentielle, synthèse — Résilience : crash serveur et coupure réseau
- Règle d'or après un crash serveur — essentielle — Résilience : crash serveur et coupure réseau
- Reprise côté client après crash et webhook injoignable — importante — Résilience : crash serveur et coupure réseau
- Ne jamais se fier aux messages de statut — essentielle — Résilience : crash serveur et coupure réseau
- Agent Card, contrat publié à une URI bien connue — essentielle — Découverte des agents et Agent Card
- Champs obligatoires de l'Agent Card — essentielle — Découverte des agents et Agent Card
- Vérification et sélection lors de la découverte — essentielle, synthèse — Découverte des agents et Agent Card
- Le registre d'agents, chaînon manquant — importante — Découverte des agents et Agent Card
- Trois stratégies de découverte d'un agent — essentielle, synthèse — Découverte des agents et Agent Card
- Carte étendue via GetExtendedAgentCard — importante — Découverte des agents et Agent Card
- Signature cryptographique des Agent Cards — essentielle — Découverte des agents et Agent Card
- Mise en cache de l'Agent Card — importante — Découverte des agents et Agent Card
- Principe de sécurité délégué d'A2A — essentielle, synthèse — Sécurité : authentification, autorisation, confiance
- Schémas d'authentification déclarables — essentielle — Sécurité : authentification, autorisation, confiance
- Déroulement d'un flux d'authentification — essentielle, synthèse — Sécurité : authentification, autorisation, confiance
- Interruption AUTH_REQUIRED en cours de tâche — essentielle — Sécurité : authentification, autorisation, confiance
- Obligations de sécurité côté serveur — importante — Sécurité : authentification, autorisation, confiance
- Menaces spécifiques à A2A et contre-mesures — importante — Sécurité : authentification, autorisation, confiance
- Limite de la délégation d'identité de bout en bout — importante, synthèse — Sécurité : authentification, autorisation, confiance
