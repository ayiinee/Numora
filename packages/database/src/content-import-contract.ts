export type ContentKind = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY';
export type QuestionUsage = 'DRILL' | 'PRETEST' | 'TRYOUT';
export interface PackageSource {
  sourceNamespace: string;
  sourceName: string;
  sourceReference: string;
}
export interface RichContent {
  text: string;
  assetKeys?: string[];
}
export interface ContentOption {
  id: string;
  content: RichContent;
}
export interface ContentCategory {
  id: string;
  label: string;
}
export interface ContentAsset {
  externalId: string;
  assetId: string;
  textMarker: string;
  placement: 'STEM' | 'OPTION' | 'STATEMENT' | 'EXPLANATION';
  itemId: string | null;
  assetOrder: number;
  altText: string;
  objectKey: string | null;
  sha256: string;
  contentType: string;
  byteLength: number;
  bucket: string;
}
export type ContentAnswer =
  | { optionId: string }
  | { optionIds: string[] }
  | { categoryByStatementId: Record<string, string> }
  | null;
export interface ImportQuestion {
  externalId: string;
  type: ContentKind;
  chapterCode: string;
  subchapterCode: string;
  competencyCode: string;
  levelCode?: string | null;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | null;
  stem: RichContent;
  options: ContentOption[];
  answer: Exclude<ContentAnswer, null>;
  explanation: RichContent;
  metadata: Record<string, unknown> & {
    sourceLevelNumber: number;
    sourceOrder?: number;
    sourceQuestionId?: string;
    assetManifest?: ContentAsset[];
    categories?: ContentCategory[];
  };
}
export interface PreviewSnapshot {
  externalId: string;
  type: ContentKind;
  stem: RichContent;
  options: ContentOption[];
  categories: ContentCategory[];
  answerKey: Exclude<ContentAnswer, null>;
  explanation: RichContent;
  assets: ContentAsset[];
}
