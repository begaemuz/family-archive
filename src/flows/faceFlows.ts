/* После загрузки фото: в фоне ищем лица, сохраняем их в архив и, если кого-то узнали,
   открываем фото с вопросом «Кажется, это …?». */
import { facesAvailable, matchFaces, toMediaFaces } from '../faces/faces';
import { useArchive } from '../store/archiveStore';
import { useUi } from '../store/uiStore';

export async function suggestFaces(mediaIds: string[], ownerId: string) {
  if (!facesAvailable) return;
  const withAsks: string[] = [];
  useUi.getState().showToast('Ищу знакомые лица на фото…');
  for (const id of mediaIds) {
    const data = useArchive.getState().data;
    const item = data?.media.find(m => m.id === id);
    if (!data || !item) return; // архив закрыли
    try {
      const matches = await matchFaces(data, item);
      useArchive.getState().setMediaFaces(id, toMediaFaces(matches));
      if (matches.some(m => m.suggestId)) withAsks.push(id);
    } catch {
      return; // распознавание недоступно — молча, это лишь подсказка
    }
  }
  const ui = useUi.getState();
  // не перебиваем, если человек уже что-то смотрит
  if (!withAsks.length || ui.lightbox) return;
  ui.openLightbox({ ids: withAsks, index: 0, ownerId });
}
