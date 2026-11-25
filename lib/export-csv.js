// Small helpers to download tables as a CSV file that opens correctly in Excel (UTF-8 with BOM).

export function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** sections: [{ title, columns: [..headers], rows: [[..cells]] }] -> one CSV text, sections separated by a blank line */
export function buildCsv(sections) {
    return sections
        .map((section) => {
            const lines = [];
            if (section.title) lines.push(csvCell(section.title));
            if (section.columns?.length) lines.push(section.columns.map(csvCell).join(','));
            for (const row of section.rows || []) lines.push(row.map(csvCell).join(','));
            return lines.join('\r\n');
        })
        .join('\r\n\r\n');
}

export function downloadCsv(filename, text) {
    const blob = new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
