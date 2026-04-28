import { api, toast } from '/static/js/api.js';
import { renderSingleHeatmap } from '/static/js/heatmap.js';

function rowTemplate() {
    return `
        <div class="ov-row">
            <a class="ov-label" href=""><span class="ov-icon"></span><span class="ov-name"></span></a>
            <div class="ov-heatmap">
                <div class="hm-months"></div>
                <div class="heatmap"></div>
            </div>
        </div>
    `;
}

export async function renderStatsOverview() {
    const root = document.getElementById('overviewRows');
    if (!root) return;

    let data;
    try {
        data = await api.get('/api/v1/stats/overview');
    } catch (e) {
        toast(e.message, 'error');
        return;
    }

    // Aggregate cards
    const agg = data.aggregate;
    document.getElementById('aActive').textContent = agg.active_count;
    document.getElementById('aAvg30').textContent = agg.active_count ? `${agg.avg_30d}%` : '—';
    document.getElementById('aBestStreak').textContent = agg.best_streak;
    document.getElementById('aToday').textContent = agg.active_count
        ? `${agg.today_done}/${agg.active_count}`
        : '—';

    // Per-habit rows
    const weeks = window.innerWidth >= 768 ? 13 : 6;
    root.innerHTML = '';
    for (const h of data.habits) {
        const wrap = document.createElement('div');
        wrap.innerHTML = rowTemplate().trim();
        const row = wrap.firstElementChild;
        row.querySelector('.ov-label').href = `/habits/${h.id}`;
        row.querySelector('.ov-icon').textContent = h.icon || '📌';
        row.querySelector('.ov-name').textContent = h.name;
        renderSingleHeatmap(
            row.querySelector('.ov-heatmap'),
            h.days,
            weeks,
            null,                          // habitId=null -> read-only cells
            h.target_count || 1,
        );
        root.appendChild(row);
    }
}

document.addEventListener('DOMContentLoaded', renderStatsOverview);
