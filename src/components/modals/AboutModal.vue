<template>
  <modal-inner class="modal__inner-1--about-modal" aria-label="About">
    <div class="modal__content">
      <div class="logo-background"></div>
      <div class="about-fork-badge">Community Fork</div>
      <a target="_blank" rel="noopener noreferrer" href="https://github.com/soreavis/stackedit/">Fork on GitHub</a>
      <br>
      <a target="_blank" rel="noopener noreferrer" href="https://github.com/soreavis/stackedit/issues">Issue tracker</a> — <a target="_blank" rel="noopener noreferrer" href="https://github.com/soreavis/stackedit/blob/master/CHANGELOG.md">Fork changelog</a>
      <br>
      <a target="_blank" rel="noopener noreferrer" href="https://github.com/benweet/stackedit/">Upstream StackEdit</a> — <a target="_blank" rel="noopener noreferrer" href="https://community.stackedit.io/">Upstream community</a>
      <hr>
      <small>
        © 2013–2019 Dock5 Software Ltd. (original StackEdit)<br>
        Fork © 2026 soreavis<br>
        v{{ version }}
      </small>
      <h3>FAQ</h3>
      <div class="faq" v-html="faq"></div>
      Licensed under an
      <a target="_blank" rel="noopener noreferrer" href="http://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a>
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
  margin: 0 0 1em;
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

.faq {
  font-size: 0.8em;
  line-height: 1.5;
}
</style>
