import type { LibraryFileKind, ProjectStatus, UpdateVisibility } from '@agency-os/db';

export type LibraryKindFilter = 'folders' | 'image' | 'video' | 'document';

export type LibrarySort = 'name' | 'date' | 'size';

export type LibraryQuery = {
  projectId?: string;
  folderId?: string;
  q?: string;
  kind?: LibraryKindFilter;
  sort?: LibrarySort;
};

export type FolderView = {
  id: string;
  name: string;
  /** The visibility of the folder's root, which the folder follows. */
  visibility: UpdateVisibility;
  /** Ready files in the folder and every folder below it. */
  fileCount: number;
};

export type FileView = {
  id: string;
  name: string;
  kind: LibraryFileKind;
  sizeBytes: number;
  createdAt: string;
  uploadedByName: string | null;
  /** The containing folder, set when the list spans the whole project (search or a kind filter). */
  folderName: string | null;
  canDelete: boolean;
};

export type LibraryView = {
  projects: { id: string; name: string; status: ProjectStatus }[];
  projectId: string | null;
  folder: {
    id: string;
    name: string;
    visibility: UpdateVisibility;
    trail: { id: string; name: string }[];
  } | null;
  folders: FolderView[];
  files: FileView[];
  /** Whether the caller may upload here: the team anywhere, the operational user inside a folder. */
  canWrite: boolean;
  canCreateRoot: boolean;
};
