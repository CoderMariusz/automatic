# PRD: TestApp - Aplikacja do zarządzania zadaniami

**Wersja:** 1.0
**Data:** 2026-01-21
**Status:** APPROVED

---

## 1. Executive Summary

TestApp to prosta aplikacja webowa do zarządzania zadaniami osobistymi. Umożliwia użytkownikom tworzenie, edycję i śledzenie postępu zadań.

---

## 2. Problem Statement

Użytkownicy potrzebują prostego narzędzia do organizacji codziennych zadań bez zbędnych funkcji enterprise.

---

## 3. Goals & Success Metrics

| Cel | Metryka | Target |
|-----|---------|--------|
| Łatwe dodawanie zadań | Czas dodania | <5 sekund |
| Śledzenie postępu | % ukończonych | >80% widoczność |

---

## 4. Target Users

**Primary:** Osoba pracująca zdalnie, 25-40 lat, potrzebuje prostej organizacji.

---

## 5. Solution Overview

Minimalistyczna aplikacja SPA z listą zadań, statusami i filtrowaniem.

---

## 6. Features & Scope

### 6.1 MVP Features (P0)

| # | Feature | Moduł |
|---|---------|-------|
| 1 | Lista zadań | Tasks |
| 2 | Dodawanie zadania | Tasks |
| 3 | Oznaczanie jako done | Tasks |
| 4 | Filtrowanie (all/active/done) | Tasks |

### 6.2 Post-MVP (P1)

| # | Feature |
|---|---------|
| 1 | Kategorie zadań |
| 2 | Przypomnienia |

---

## 7. Technical Architecture

### 7.1 Technology Stack

| Warstwa | Technologia |
|---------|-------------|
| Frontend | Next.js 14 + React |
| Styling | Tailwind CSS |
| State | React useState |
| Storage | localStorage (MVP) |

---

## 8. Modules

### 8.1 Module: Tasks

**Priority:** P0
**Description:** Główny moduł zarządzania zadaniami
**Features:** Lista, dodawanie, edycja, usuwanie, filtrowanie

---

## 9. User Flows

### 9.1 Flow: Dodanie zadania

| Krok | Akcja | System |
|------|-------|--------|
| 1 | User klika "Add" | Pokazuje input |
| 2 | User wpisuje tekst | - |
| 3 | User klika Enter | Dodaje do listy |

### 9.2 Flow: Oznaczenie jako done

| Krok | Akcja | System |
|------|-------|--------|
| 1 | User klika checkbox | Toggle status |
| 2 | - | Aktualizuje UI |

---

## 10. Epics & Stories

### Epic 1: Core Task Management

Podstawowa funkcjonalność zarządzania zadaniami.

**Stories:**
1. **Story 1.1: Task List Component** - Wyświetlanie listy zadań z checkboxami
2. **Story 1.2: Add Task Feature** - Input i przycisk do dodawania nowych zadań

### Epic 2: Task Filtering

Filtrowanie i organizacja zadań.

**Stories:**
1. **Story 2.1: Filter Buttons** - Przyciski All/Active/Completed
2. **Story 2.2: Filter Logic** - Logika filtrowania listy

---

## 11. Timeline

| Milestone | Target |
|-----------|--------|
| MVP | 1 tydzień |
| V1.1 | 2 tygodnie |

---

## 12. Appendix

### Source Documents
- discovery.yaml
- brainstorm.yaml

### Glossary
- **Task** - pojedyncze zadanie do wykonania
- **Done** - status zakończonego zadania
