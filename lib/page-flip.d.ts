declare module "page-flip" {
  export type FlipCorner = "top" | "bottom";

  export type PageFlipSettings = {
    width: number;
    height: number;
    size?: "fixed" | "stretch";
    mode?: "portrait" | "landscape";
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    startPage?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    useMouseTouch?: boolean;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
  };

  export type PageFlipEvent<T = unknown> = {
    data: T;
    object: PageFlip;
  };

  export class PageFlip {
    constructor(element: HTMLElement, settings: PageFlipSettings);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    update(): void;
    destroy(): void;
    flipNext(corner?: FlipCorner): void;
    flipPrev(corner?: FlipCorner): void;
    turnToPage(page: number): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    on<T = unknown>(event: string, callback: (event: PageFlipEvent<T>) => void): PageFlip;
    off(event: string): void;
  }
}
