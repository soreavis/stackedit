<template>
  <div class="toc">
    <div class="toc__controls">
      <span class="toc__controls-label">Show</span>
      <button
        v-for="lvl in [1, 2, 3, 4, 5, 6]"
        :key="lvl"
        class="toc__controls-btn"
        :class="{ 'toc__controls-btn--active': lvl <= foldLevel }"
        :title="`Show up to H${lvl}`"
        @click="foldLevel = lvl"
      >H{{ lvl }}</button>
    </div>
    <div class="toc__mask" :style="{top: (maskY - 5) + 'px'}"></div>
    <div class="toc__inner" :class="`toc__inner--fold-${foldLevel}`"></div>
  </div>
</template>

<script>

import { mapState as mapPiniaState } from 'pinia';
import editorSvc from '../services/editorSvc';
import { useLayoutStore } from '../stores/layout';

export default {
  data: () => ({
    maskY: 0,
    // Outline fold level: show headings up to and including H<foldLevel>.
    // 6 = show everything (default), 1 = only top-level headings.
    foldLevel: 6,
  }),
  computed: {
    ...mapPiniaState(useLayoutStore, [
      'styles',
    ]),
  },
  mounted() {
    const tocElt = this.$el.querySelector('.toc__inner');

    // TOC click behaviour
    let isMousedown;
    function onClick(e) {
      if (!isMousedown) {
        return;
      }
      e.preventDefault();
      const y = e.clientY - tocElt.getBoundingClientRect().top;

      editorSvc.previewCtx.sectionDescList.some((sectionDesc) => {
        if (y >= sectionDesc.tocDimension.endOffset) {
          return false;
        }
        const posInSection = (y - sectionDesc.tocDimension.startOffset)
          / (sectionDesc.tocDimension.height || 1);
        const editorScrollTop = sectionDesc.editorDimension.startOffset
          + (sectionDesc.editorDimension.height * posInSection);
        editorSvc.editorElt.parentNode.scrollTop = editorScrollTop;
        const previewScrollTop = sectionDesc.previewDimension.startOffset
          + (sectionDesc.previewDimension.height * posInSection);
        editorSvc.previewElt.parentNode.scrollTop = previewScrollTop;
        return true;
      });
    }

    tocElt.addEventListener('mouseup', () => {
      isMousedown = false;
    });
    tocElt.addEventListener('mouseleave', () => {
      isMousedown = false;
    });
    tocElt.addEventListener('mousedown', (e) => {
      isMousedown = e.which === 1;
      onClick(e);
    });
    tocElt.addEventListener('mousemove', (e) => {
      onClick(e);
    });

    // Change mask postion on scroll
    const updateMaskY = () => {
      const scrollPosition = editorSvc.getScrollPosition();
      if (scrollPosition) {
        const sectionDesc = editorSvc.previewCtxMeasured.sectionDescList[scrollPosition.sectionIdx];
        this.maskY = sectionDesc.tocDimension.startOffset +
          (scrollPosition.posInSection * sectionDesc.tocDimension.height);
      }
    };

    this.$nextTick(() => {
      editorSvc.editorElt.parentNode.addEventListener('scroll', () => {
        if (this.styles.showEditor) {
          updateMaskY();
        }
      });
      editorSvc.previewElt.parentNode.addEventListener('scroll', () => {
        if (!this.styles.showEditor) {
          updateMaskY();
        }
      });
    });
  },
};
</script>

<style lang="scss">
.toc__inner {
  position: relative;
  color: rgba(0, 0, 0, 0.67);
  cursor: pointer;
  font-size: 9px;
  padding: 10px 20px 40px;
  white-space: nowrap;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;

  * {
    font-weight: inherit;
  }

  .cl-toc-section {
    /* Hover target lives on each heading. Vertical spacing moved from
       margin to padding so the "dead zone" between rows is part of the
       element and participates in :hover. Indentation likewise moved
       from margin-left to padding-left so the hover bg extends flush
       to the content-box left edge instead of starting at the indent. */
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0;
      padding-top: 0.4rem;
      padding-bottom: 0.4rem;
      padding-right: 0;
      border-radius: 3px;
      transition: color 120ms ease, background-color 120ms ease;

      &:hover {
        color: rgba(0, 0, 0, 0.95);
        background-color: rgba(0, 0, 0, 0.06);
      }
    }

    h1,
    h2 {
      &::after {
        display: none;
      }
    }

    h1 { padding-left: 0; }
    h2 { padding-left: 8px; }
    h3 { padding-left: 16px; }
    h4 { padding-left: 24px; }
    h5 { padding-left: 32px; }
    h6 { padding-left: 40px; }
  }

  /* Outline fold: hide headings deeper than the chosen level. Layered
     selectors so each fold level cascades correctly (level 3 = hide h4-h6,
     level 4 = hide h5-h6, etc.). */
  &--fold-1 .cl-toc-section h2,
  &--fold-1 .cl-toc-section h3,
  &--fold-1 .cl-toc-section h4,
  &--fold-1 .cl-toc-section h5,
  &--fold-1 .cl-toc-section h6,
  &--fold-2 .cl-toc-section h3,
  &--fold-2 .cl-toc-section h4,
  &--fold-2 .cl-toc-section h5,
  &--fold-2 .cl-toc-section h6,
  &--fold-3 .cl-toc-section h4,
  &--fold-3 .cl-toc-section h5,
  &--fold-3 .cl-toc-section h6,
  &--fold-4 .cl-toc-section h5,
  &--fold-4 .cl-toc-section h6,
  &--fold-5 .cl-toc-section h6 {
    display: none;
  }
}

.toc__controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  user-select: none;
}

.toc__controls-label {
  margin-right: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toc__controls-btn {
  flex: 1;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  cursor: pointer;
  font-family: inherit;
  text-transform: none;

  &--active {
    background: rgba(52, 155, 232, 0.12);
    color: rgba(0, 0, 0, 0.8);
    border-color: rgba(52, 155, 232, 0.3);
  }

  &:hover { background: rgba(0, 0, 0, 0.05); }
}

.toc__mask {
  position: absolute;
  left: 0;
  width: 100%;
  height: 35px;
  background-color: rgba(255, 255, 255, 0.2);
  pointer-events: none;
}
</style>
