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
  chapterCode: string | null;
  subchapterCode: string | null;
  competencyCode: string | null;
  levelCode?: string | null;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | null;
  stem: RichContent;
  options: ContentOption[];
  answer: Exclude<ContentAnswer, null>;
  explanation: RichContent;
  metadata: Record<string, unknown> & {
    sourceLevelNumber: number | null;
    sourceOrder?: number;
    sourceQuestionId?: string;
    assetManifest?: ContentAsset[];
    categories?: ContentCategory[];
  };
}
/** Intake is editable source data, never a final import contract. */
export interface IntakeQuestion extends Omit<
  ImportQuestion,
  'chapterCode' | 'subchapterCode' | 'competencyCode' | 'metadata'
> {
  chapterCode: string | null;
  subchapterCode: string | null;
  competencyCode: string | null;
  metadata: Record<string, unknown> & {
    sourceLevelNumber: number | null;
    sourceSheet?: string | undefined;
    sourceRowNumber?: number | undefined;
    sourceOrder?: number;
    sourceQuestionId?: string;
    categories?: ContentCategory[];
    assetManifest: ContentAsset[];
    sourceMaterial?:
      | {
          chapter: string;
          subchapter: string;
          competency: string;
          level: string;
          naming: 'NAME' | 'CODE';
        }
      | undefined;
    materialIds?: {
      chapterId: string | null;
      subchapterId: string | null;
      competencyId: string | null;
      levelId: string | null;
    };
    materialOrigins?: Record<string, 'EXCEL' | 'AUTO' | 'USER'>;
    materialReferences?: Record<string, string>;
  };
}
export interface UploadDestination {
  assessmentType: QuestionUsage;
  title: string;
  chapterId: string | null;
  subchapterId: string | null;
  levelId: string | null;
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
