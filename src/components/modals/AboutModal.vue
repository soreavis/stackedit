<template>
  <modal-inner class="modal__inner-1--about-modal" aria-label="About">
    <div class="modal__content">
      <div class="logo-background"></div>
      <div class="about-fork-badge">Independent Successor</div>
      <p class="about-tagline">Markdown editor with live preview, Mermaid, KaTeX, and cloud sync. Actively maintained continuation of StackEdit.</p>
      <a target="_blank" rel="noopener noreferrer" href="https://github.com/soreavis/stackedit/">View on GitHub</a>
      <br>
      <a target="_blank" rel="noopener noreferrer" href="https://github.com/soreavis/stackedit/issues">Issue tracker</a> — <a target="_blank" rel="noopener noreferrer" href="https://github.com/soreavis/stackedit/blob/main/CHANGELOG.md">Changelog</a>
      <hr>
      <small>
        © 2013–2019 Dock5 Software Ltd. (original StackEdit)<br>
        © 2026 soreavis<br>
        v{{ version }}<br>
        Based on <a target="_blank" rel="noopener noreferrer" href="https://github.com/benweet/stackedit/">benweet/stackedit</a> (dormant since 2023)
      </small>
      <h3>FAQ</h3>
      <div class="faq" v-html="faq"></div>
      Licensed under an
      <a target="_blank" rel="noopener noreferrer" href="http://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a><br>
      <a target="_blank" rel="noopener noreferrer" href="/privacy.html">Privacy Policy</a>
    </div>
    <div class="modal__button-bar">
      <button class="button button--resolve" @click="config.resolve()">Close</button>
    </div>
  </modal-inner>
</template>

<script>
import { mapGetters } from 'vuex';
import ModalInner from './common/ModalInner';
import markdownConversionSvc from '../../services/markdownConversionSvc';
import faq from '../../data/faq.md?raw';

export default {
  components: {
    ModalInner,
  },
  data: () => ({
    version: VERSION,
  }),
  computed: {
    ...mapGetters('modal', [
      'config',
    ]),
    faq() {
      return markdownConversionSvc.defaultConverter.render(faq);
    },
  },
};
</script>

<style lang="scss">
.modal__inner-1--about-modal {
  text-align: center;

  .logo-background {
    height: 75px;
    margin: 0.5em 0;
  }

  small {
    display: block;
  }

  hr {
    width: 160px;
    max-width: 100%;
    margin: 1.5em auto;
  }
}

.about-fork-badge {
  display: inline-block;
  margin: 0 0 0.6em;
  padding: 0.15em 0.6em;
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #555;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999px;

  .app--dark & {
    color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.08);
  }
}

.about-tagline {
  margin: 0 auto 1.2em;
  max-width: 36em;
  font-size: 0.85em;
  line-height: 1.45;
  color: rgba(0, 0, 0, 0.65);

  .app--dark & {
    color: rgba(255, 255, 255, 0.7);
  }
}

.faq {
  font-size: 0.8em;
  line-height: 1.5;
}
</style>
