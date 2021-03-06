/*  GRAPHITE2 LICENSING

    Copyright 2010, SIL International
    All rights reserved.

    This library is free software; you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published
    by the Free Software Foundation; either version 2.1 of License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
    Lesser General Public License for more details.

    You should also have received a copy of the GNU Lesser General Public
    License along with this library in the file named "LICENSE".
    If not, write to the Free Software Foundation, 51 Franklin Street, 
    Suite 500, Boston, MA 02110-1335, USA or visit their web page on the 
    internet at http://www.fsf.org/licenses/lgpl.html.

Alternatively, the contents of this file may be used under the terms of the
Mozilla Public License (http://mozilla.org/MPL) or the GNU General Public
License, as published by the Free Software Foundation, either version 2
of the License or (at your option) any later version.
*/
#pragma once

#include "inc/Main.h"

#include "inc/Pass.h"

namespace graphite2 {

class Face;
class Segment;
class FeatureVal;
class VMScratch;

class Pseudo
{
public:
    uint32 uid;
    uint32 gid;
    CLASS_NEW_DELETE
};

class Justinfo
{
public:
    Justinfo(uint8 stretch, uint8 shrink, uint8 step, uint8 weight) :
        m_astretch(stretch), m_ashrink(shrink), m_astep(step),
        m_aweight(weight) {};
private:
    uint8   m_astretch;
    uint8   m_ashrink;
    uint8   m_astep;
    uint8   m_aweight;
};

class Silf
{
public:
    Silf() throw();
    ~Silf() throw();
    
    bool readGraphite(const void *pSilf, size_t lSilf, const Face &face, uint32 version);
    bool runGraphite(Segment *seg, uint8 firstPass=0, uint8 lastPass=0) const;
    uint16 findClassIndex(uint16 cid, uint16 gid) const;
    uint16 getClassGlyph(uint16 cid, unsigned int index) const;
    uint16 findPseudo(uint32 uid) const;
    uint8 numUser() const { return m_aUser; }
    uint8 aPseudo() const { return m_aPseudo; }
    uint8 aBreak() const { return m_aBreak; }
    uint8 aMirror() const {return m_aMirror; }
    uint8 substitutionPass() const { return m_sPass; }
    uint8 positionPass() const { return m_pPass; }
    uint8 justificationPass() const { return m_jPass; }
    uint8 bidiPass() const { return m_bPass; }
    uint8 numPasses() const { return m_numPasses; }
    uint8 maxCompPerLig() const { return m_iMaxComp; }
    uint16 numClasses() const { return m_nClass; }

    CLASS_NEW_DELETE

private:
    size_t readClassMap(const byte *p, size_t data_len, uint32 version);
    template<typename T> inline uint32 readClassOffsets(const byte *&p, size_t data_len);

    Pass          * m_passes;
    Pseudo        * m_pseudos;
    uint32        * m_classOffsets;
    uint16        * m_classData;
    Justinfo      * m_justs;
    uint8           m_numPasses;
    uint8           m_numJusts;
    uint8           m_sPass, m_pPass, m_jPass, m_bPass,
                    m_flags;

    uint8   m_aPseudo, m_aBreak, m_aUser, m_aBidi, m_aMirror,
            m_iMaxComp;
    uint16  m_aLig,
            m_numPseudo,
            m_nClass,
            m_nLinear;
    
    void releaseBuffers() throw();
    
    Silf(const Silf&);
    Silf& operator=(const Silf&);
};

} // namespace graphite2
