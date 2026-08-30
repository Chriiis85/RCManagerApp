import { Directive, OnDestroy, OnInit } from '@angular/core';

@Directive({
  selector: '[appBlockScroll]',
  standalone: true
})
export class BlockScrollDirective implements OnInit, OnDestroy {
  private static modalCount = 0;

  ngOnInit() {
    BlockScrollDirective.modalCount++;
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy() {
    BlockScrollDirective.modalCount--;
    if (BlockScrollDirective.modalCount <= 0) {
      BlockScrollDirective.modalCount = 0;
      document.body.style.overflow = '';
    }
  }
}
