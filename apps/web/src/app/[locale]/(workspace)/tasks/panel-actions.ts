import type { TaskPanelActions } from '@/components/tasks/task-panel';
import { finishUploadAction, startUploadsAction } from '../../library-actions';
import {
  addTaskItemAction,
  deleteTaskAction,
  setTaskItemAction,
  updateTaskAction,
} from './actions';
import {
  addTaskCommentAction,
  addTaskLinkAction,
  attachTaskFileAction,
  deleteTaskCommentAction,
  detachTaskFileAction,
  removeTaskLinkAction,
  taskUploadFolderAction,
} from './collaboration-actions';

/** The server actions of the task panel, shared by the studio and room pages. */
export const taskPanelActions: TaskPanelActions = {
  update: updateTaskAction,
  remove: deleteTaskAction,
  setItem: setTaskItemAction,
  addItem: addTaskItemAction,
  addComment: addTaskCommentAction,
  deleteComment: deleteTaskCommentAction,
  addLink: addTaskLinkAction,
  removeLink: removeTaskLinkAction,
  attachFile: attachTaskFileAction,
  detachFile: detachTaskFileAction,
  uploadFolder: taskUploadFolderAction,
  startUploads: startUploadsAction,
  finishUpload: finishUploadAction,
};
