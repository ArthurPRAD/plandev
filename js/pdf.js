async function exportPDF() {
  const status = document.getElementById('export-status');
  status.style.display = 'block';
  status.textContent = 'Capture de la carte en cours...';

  const chantier = window.getChantierData();

  try {
    // Capturer la carte principale
    const mapEl = document.getElementById('map');
    const canvas = await html2canvas(mapEl, {
      useCORS: true,
      allowTaint: true,
      scale: 1.5,
      logging: false
    });

    const mapImgData = canvas.toDataURL('image/jpeg', 0.92);

    status.textContent = 'Génération du PDF...';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const pageW = 297;
    const pageH = 210;
    const margin = 14;

    // ===== EN-TÊTE =====
    doc.setFillColor(24, 95, 165);
    doc.rect(0, 0, pageW, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(chantier.nom || 'Plan de déviation', margin, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const headerRight = `${chantier.entreprise || ''}   |   Du ${formatDatePDF(chantier.dateDebut)} au ${formatDatePDF(chantier.dateFin)}`;
    doc.text(headerRight, pageW - margin, 14, { align: 'right' });

    // ===== CARTE =====
    const imgY = 26;
    const imgH = pageH - imgY - 20;
    const imgW = pageW - margin * 2;

    doc.addImage(mapImgData, 'JPEG', margin, imgY, imgW, imgH);

    // Bordure autour de la carte
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(margin, imgY, imgW, imgH);

    // ===== LÉGENDE =====
    const legendY = imgY + imgH + 4;

    // Route barrée
    doc.setDrawColor(226, 75, 74);
    doc.setLineWidth(1.5);
    doc.setLineDash([3, 2]);
    doc.line(margin, legendY + 2, margin + 14, legendY + 2);
    doc.setLineDash([]);
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text('Route barrée', margin + 17, legendY + 4);

    // Déviation principale
    doc.setDrawColor(29, 158, 117);
    doc.setLineWidth(2);
    doc.line(margin + 65, legendY + 2, margin + 79, legendY + 2);
    doc.text('Déviation principale', margin + 82, legendY + 4);

    // Déviation secondaire
    doc.setDrawColor(55, 138, 221);
    doc.line(margin + 145, legendY + 2, margin + 159, legendY + 2);
    doc.text('Déviation secondaire', margin + 162, legendY + 4);

    // ===== PIED DE PAGE =====
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Généré par PlanDév · ${now} · Données cartographiques © OpenStreetMap`, pageW / 2, pageH - 4, { align: 'center' });

    // ===== SAUVEGARDE =====
    const filename = `deviation_${(chantier.nom || 'chantier').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    status.textContent = '✓ PDF téléchargé avec succès';
    status.style.color = '#1D9E75';
    status.style.background = '#E1F5EE';

    setTimeout(() => { status.style.display = 'none'; }, 3000);

  } catch (err) {
    console.error('Erreur PDF:', err);
    status.textContent = 'Erreur lors de la génération du PDF. Réessayez.';
    status.style.color = '#E24B4A';
    status.style.background = '#FCEBEB';
  }
}

function formatDatePDF(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
