import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** Small bar chart summarising the current report page. */
@Component({
  selector: 'eiw-report-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: block; position: relative; height: 220px; }`,
  template: `<canvas #canvas role="img" [attr.aria-label]="title()"></canvas>`,
})
export class ReportChartComponent implements OnDestroy {
  readonly data = input.required<{ label: string; count: number }[]>();
  readonly title = input('Summary');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const data = this.data();
      const el = this.canvas().nativeElement;
      if (!el.getContext?.('2d')) return;
      if (this.chart) {
        this.chart.data.labels = data.map((d) => d.label);
        this.chart.data.datasets[0].data = data.map((d) => d.count);
        this.chart.update();
        return;
      }
      this.chart = new Chart(el, {
        type: 'bar',
        data: { labels: data.map((d) => d.label), datasets: [{ label: 'Rows', data: data.map((d) => d.count), backgroundColor: '#3f6ad8' }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
