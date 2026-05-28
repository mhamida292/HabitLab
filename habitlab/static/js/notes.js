import { api, toast } from '/static/js/api.js';

let currentContext = null;

export function openNoteEditor({ habitId, date, existing, onSave }) {
    currentContext = { habitId, date, onSave };
    document.getElementById('noteDate').value = date;
    document.getElementById('noteText').value = existing?.text || '';
    const preview = document.getElementById('noteImagePreview');
    preview.innerHTML = existing?.image_url
        ? `<img src="${existing.image_url}" style="max-width:100%;border-radius:8px"><input type="hidden" id="noteImageUrl" value="${existing.image_url}">`
        : '';
    document.getElementById('noteOv').classList.add('on');
}

export function closeNote() {
    document.getElementById('noteOv').classList.remove('on');
    currentContext = null;
}

window.closeNote = closeNote;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('noteImage')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
            const { url } = await api.upload('/api/v1/uploads', fd);
            document.getElementById('noteImagePreview').innerHTML =
                `<img src="${url}" style="max-width:100%;border-radius:8px"><input type="hidden" id="noteImageUrl" value="${url}">`;
        } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('noteSave')?.addEventListener('click', async () => {
        if (!currentContext) return;
        const text = document.getElementById('noteText').value;
        try {
            await api.post(`/api/v1/habits/${currentContext.habitId}/completions`, {
                done: true,
                date: currentContext.date,
                text,
                date_fmt: '%Y-%m-%d',
            });
            currentContext.onSave?.();
            toast('Saved');
            closeNote();
        } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('noteDelete')?.addEventListener('click', async () => {
        if (!currentContext) return;
        try {
            await api.post(`/api/v1/habits/${currentContext.habitId}/completions`, {
                done: false,
                date: currentContext.date,
                text: null,
                date_fmt: '%Y-%m-%d',
            });
            currentContext.onSave?.();
            closeNote();
        } catch (err) { toast(err.message, 'error'); }
    });
});
