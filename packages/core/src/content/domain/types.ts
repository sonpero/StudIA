export type Difficulty = "easy" | "medium" | "hard";

export type Notion = {
  id: string;
  documentId: string;
  userId: string;
  title: string; // asked 3 to 80 chars, tolerated to 100 then shortened (fit-title.ts)
  body: string; // Markdown, self-contained
  difficulty: Difficulty; // model-suggested, user-editable
  position: number; // order in the course, contiguous from 0
  createdAt: string;
};

export type SplitNotion = { title: string; body: string; difficulty: Difficulty };
